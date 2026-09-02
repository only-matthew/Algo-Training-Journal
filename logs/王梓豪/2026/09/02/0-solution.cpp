#include <bits/stdc++.h>
using namespace std;
bool solve(vector<int> &v,int l,int m,int k)
{
    vector<int> v1(v.begin(),v.begin()+l);
    sort(v1.begin(),v1.end());
    int ft=0;int ed=m-1;
    bool flag=0;
    if(ed>=v1.size())return false;
    if(v1[ed]-v1[ft]<=k)return true;
    while(ed<v1.size()&&v1[ed]-v1[ft]>k)
    {
        if(v1[ed]-v1[ft]<=k)return true;
        ed++;
        ft++;
    }
    return false;
}
int main()
{
int n,m,k;
cin>>n>>m>>k;
vector<int> v(n);
for(int i=0;i<n;i++)
{
    cin>>v[i];
}
  int mid,left = 1,right = n;
    int ans=-1;
    while (left<=right)
    {
        mid=(left+right)/2;
        if (solve(v,mid,m,k))
        {
            ans=mid;
            right=mid-1;
        }
        else
        {
            left=mid+1;
        }
    }
    cout<<ans<<endl;
}