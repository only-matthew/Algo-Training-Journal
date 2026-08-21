#include<iostream>
using namespace std;
int q[1010];
bool a[1010];
int main()
{
    int m,n;
    cin>>m>>n;
    int tou=0,wei=0;
    int ans=0;
    for(int i=1;i<=n;i++)
    {
        int x;cin>>x;
        if(a[x])continue;
        ans++;
        if(wei-tou==m)
        {
            a[q[tou]]=false;
            tou++;
        }
        q[wei]=x;
        wei++;
        a[x]=true;
    }
    cout<<ans<<endl;
    return 0;
}