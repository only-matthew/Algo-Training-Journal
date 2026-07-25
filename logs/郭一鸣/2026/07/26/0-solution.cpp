#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        string s;
        cin>>n>>s;
        int now=0,maxn=0;
        for(int i=0;i<n;i++)
        {
            if(s[i]=='#')
            {
                now++;
                if(now>maxn)maxn=now;
            }
            else now=0;
        }
        cout<<(maxn+1)/2<<endl;
    }
    return 0;
}