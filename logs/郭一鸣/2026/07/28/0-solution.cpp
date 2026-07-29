#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,k;
        string s;
        cin>>n>>k;
        cin>>s;
        if(k*2>n)
        {
            cout<<-1<<endl;continue;
        }
        int ans=0;
        for(int i=0;i<k;i++)
        {
            if(s[i]=='L')ans++;
        }
        for(int i=n-k;i<n;i++)
        {
            if(s[i]=='R')ans++;
        }
        cout<<ans<<endl;
    }
    return 0;
}