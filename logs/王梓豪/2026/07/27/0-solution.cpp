#include <bits/stdc++.h>
using namespace std;
int main()
{
    int n,t;
    cin>>t;
    while(t--)
    {
    cin>>n;
    int max_=INT_MAX,min_=INT_MIN;
    vector<int> a(n);
    for(int i=0;i<n;i++)
    cin>>a[i];
    if(n%2==1){
    cout<<"NO"<<endl;
    continue;
    }bool flag=false;
    for(int i=0;i<n-1;i++)
    {
        if(i%2==0){max_=min(max_,a[i]);
            if(a[i]<=(a[i+1]+1))
            {
                cout<<"NO"<<endl;flag=true;break;
            }
        }
        else if(i%2==1){min_=max(min_,a[i]);
            if(a[i]>=(a[i+1]-1))
            {
                cout<<"NO"<<endl;flag=true;break;
            }
        }
    }
    min_=max(min_,a[n-1]);
    if(max_>(min_+1)&&flag==false)
        {
            cout<<"YES"<<endl;
        }
        else if(flag==false)
        {
            cout<<"NO"<<endl;
        }
    }
    cin>>n;
}